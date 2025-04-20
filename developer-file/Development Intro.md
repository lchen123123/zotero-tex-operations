# Zotero Tex Operations 插件

本插件旨在提供一套完整的工具，用于处理Zotero中的Tex/LaTex源代码文件，这些文件通常以`[arXivID] Tex_Source.zip`命名的压缩包形式存在。

## 功能概述

由于Zotero不支持将文件夹作为附件添加，也无法将解压后的文件夹上传到Zotero云端，因此本插件采用以下工作流程：
1. 将Tex_Source.zip文件在本地解压
2. 在本地进行操作和源码分析
3. 处理完成后重新打包为Tex_Source.zip替代原有附件文件
4. 所有操作需生成本地日志文件，以方便用户查看和debug

## 主要功能

对于单个选中的Tex_Source.zip文件，插件提供以下上下文菜单选项：

### 1. Zip-file regulariation（压缩文件规范化）

这是所有其他步骤的预备工作：
- 获取Tex_Source.zip文件的本地路径并解压
  - 生成日志：[INFO] 开始解压文件 {file_path}
  - 如解压失败，记录错误：[ERROR] 解压失败：{error_message}
- 定位主要的.tex文件
  - 生成日志：[INFO] 开始扫描.tex文件
  - 根据arXiv规则，如果解压后只有一个.tex文件，则该文件为主文件
  - 如有多个.tex文件，根据文件名首字母排序，排在前面的为主文件
  - 记录结果：[INFO] 找到主文件：{main_tex_file}
  - 如未找到.tex文件，记录错误：[ERROR] 未找到任何.tex文件
- 将主文件重命名为Main_En.tex
  - 记录操作：[INFO] 重命名主文件：{old_name} -> Main_En.tex
  - 如重命名失败，记录错误：[ERROR] 重命名失败：{error_message}
- 将其他.tex文件依次命名为SM1_En.tex, SM2_En.tex等
  - 记录操作：[INFO] 重命名附属文件：{old_name} -> {new_name}
  - 如重命名失败，记录错误：[ERROR] 重命名失败：{error_message}
- 将文件夹重新压缩为Tex_Source.zip后缀文件，替换原有Tex_Source.zip后缀附件文件
  - 记录操作：[INFO] 开始压缩文件夹
  - 如压缩失败，记录错误：[ERROR] 压缩失败：{error_message}
  - 记录操作：[INFO] 替换原有zip文件
- 为替换后的Tex_Source.zip附件添加新的Tag:"renamed"
  - 记录操作：[INFO] 添加标签：renamed
  - 如添加失败，记录错误：[ERROR] 标签添加失败：{error_message}
- 生成最终状态日志：[INFO] 文件处理完成 或 [ERROR] 处理失败，查看上述错误信息

### 2. Compile & Correction（编译与修正）
### 2.1 Compile_Correction_function
这是一个子程序，处理流程为：
- 输入：.tex文档
- 过程：利用TexLive进行编译（默认编译器为XeLaTeX，备选编译器为PDFLaTeX），如有错误则利用大语言模型(LLM)和agent进行错误修复
  具体流程为：
  - 备份原始的Main_En.tex文档
  - 利用TexLive进行编译，生成.log文件
  - 利用调用codex CLI的agent模式进行错误修复，生成.log文件(确保已安装codex CLI)
  - codex CLI需要配置API，调用OpenRouter的API，具体信息为
  API: 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
  注意保护API不被泄露
  模型选择：Gemini 2.5 Pro Experimental (free)
  - 利用TexLive进行编译，生成.log文件
  - 重复上述过程，直到编译成功
  - 最大修复次数为10次，超过10次则停止，并生成日志文件，并恢复原始.tex文档
- 输出：可以正确编译的.tex文档并命名为Main_En_corrected.tex，及完整的.log文件日志
### 2.2 Compile-Correction context menu
- 为Tex_Source.zip后缀的子条目添加Compile & Correction选项
- 点击后，调用Compile_Correction_function 对 Main_En.tex进行编译与修正
- 将输出文档保存为Main_En_corrected.tex；将输出.log文件日志保存为Main_En_corrected.log
- 删除编译过程中生成的所有中间文件
- 将文件夹重新压缩为Tex_Source.zip后缀文件，替换原有Tex_Source.zip后缀附件
- 为替换后的Tex_Source.zip附件添加新的Tag:"corrected"

### 3. Tex-regularization（Tex文档规范化）

这是一个子程序，处理流程为：
- 输入：.tex文档
- 过程：对文档进行标准化处理，包括图表、参考文献的标准化
- 输出：规范化后的.tex文档及规范化日志

### 4. 标准化排版

将.tex文档重新排版为以下标准格式之一：
- 单栏文献格式
- 双栏文献格式
- 书籍排版格式 